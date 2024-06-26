const fs = require('fs');

const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const User = require('../models/User');
const { fileUploader } = require('../utils/file-upload');
const { uploadToS3, removeFromS3 } = require('../utils/s3');

// @desc      Get all users
// @route     GET /api/v1/auth/users
// @access    Private/Admin
exports.getUsers = asyncHandler(async (req, res, next) => {
    res.status(200).json(res.advancedResults);
});

// @desc      Get single user
// @route     GET /api/v1/users/:id
// @access    Private/Admin
exports.getUser = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        return next(
            new ErrorResponse(`No user with the id of ${req.params.id}`, 404),
        );
    }

    res.status(200).json({
        success: true,
        data: user
    });
});

// @desc      Create user
// @route     POST /api/v1/users
// @access    Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
    const user = await User.create(req.body);

    const { password, ...restUser } = user._doc;

    res.status(201).json({
        success: true,
        data: restUser
    });
});

// @desc      Update user
// @route     PUT /api/v1/users/:id
// @access    Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    });

    if (!user) {
        return next(
            new ErrorResponse(`No user with the id of ${req.params.id}`, 404),
        );
    }

    res.status(200).json({
        success: true,
        data: user
    });
});

// @desc      Delete user
// @route     DELETE /api/v1/users/:id
// @access    Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
        return next(
            new ErrorResponse(`No user with the id of ${req.params.id}`),
            404
        );
    }

    // Remove previous photo if exists
    if (user.photo) {
        const previousPhotoPath = `${process.env.FILE_UPLOAD_PATH}/${user.photo}`;
        if (fs.existsSync(previousPhotoPath)) {
            fs.unlinkSync(previousPhotoPath);
        }
    }

    await user.remove();

    res.status(200).json({
        success: true,
        data: {}
    });
});

// @desc      Upload photo for user
// @route     PUT /api/v1/users/:id/photo
// @access    Private
exports.userPhotoUpload = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        return next(
            new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
        );
    }

    // Make sure user is profile owner
    if (user._id.toString() !== req.user.id && req.user.role !== 'admin') {
        return next(new ErrorResponse(`User ${req.params.id} is not authorized to update this profile`, 401));
    }

    if (!req.files) {
        return next(new ErrorResponse(`Please upload a file`, 400));
    }

    const file = fileUploader(req, user._id, next);

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `images/user_${file.name}`,
        Body: file.data,
        ContentType: file.mimetype
    };

    const s3UploadData = await uploadToS3(params, next);

    // Remove previous photo if exists
    if (user.photo) {
        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: user.photo 
        };

        await removeFromS3(deleteParams, next);
    }

    await User.findByIdAndUpdate(req.params.id, { photo: s3UploadData.key });

    res.status(200).json({
        success: true,
        data: s3UploadData.key
    });
});